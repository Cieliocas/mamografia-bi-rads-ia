import os
import glob
import numpy as np
import pandas as pd
import tensorflow as tf
import cv2

class CBISDDSMDataGenerator(tf.keras.utils.Sequence):
    def __init__(self, 
                 csv_dir, 
                 jpeg_dir, 
                 batch_size=8, 
                 img_size=(256, 256), 
                 subset='train', 
                 shuffle=True):
        self.csv_dir = csv_dir
        self.jpeg_dir = jpeg_dir
        self.batch_size = batch_size
        self.img_size = img_size
        self.subset = subset
        self.shuffle = shuffle
        
        # Load metadata
        self.data_df = self._load_metadata()
        self.indices = np.arange(len(self.data_df))
        
        if self.shuffle:
            np.random.shuffle(self.indices)
            
    def _load_metadata(self):
        """Loads and merges mass/calc extraction metadata."""
        # We need both mass and calc training sets for 'train' subset
        # For 'test', we might use the test sets.
        # Focusing on mass training set for now as per user discussion, 
        # but logically we should include calc if available.
        # User mentioned "mass_case_description_train_set.csv" specifically.
        
        dfs = []
        
        # Mapping for subsets
        if self.subset == 'train':
            files = [
                'mass_case_description_train_set.csv',
                'calc_case_description_train_set.csv'
            ]
        elif self.subset == 'test':
            files = [
                'mass_case_description_test_set.csv',
                'calc_case_description_test_set.csv'
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
        
        # Clean paths logic
        # We need 'image file path' (original) and 'ROI mask file path' (mask)
        # We will extract SeriesInstanceUID from them.
        
        valid_rows = []
        for idx, row in full_df.iterrows():
            img_path_raw = row['image file path']
            mask_path_raw = row['ROI mask file path']
            
            img_uid = img_path_raw.split('/')[-2]
            mask_uid = mask_path_raw.split('/')[-2]
            
            # Find actual files
            # print(f"Checking {img_uid}...", end='\r') # excessive printing might slow down too, but let's see
            img_real_path = self._find_file(img_uid)
            mask_real_path = self._find_file(mask_uid)
            
            if img_real_path and mask_real_path:
                valid_rows.append({
                    'image_path': img_real_path,
                    'mask_path': mask_real_path,
                    'pathology': row['pathology'],
                    'assessment': row['assessment']
                })
            
            if idx % 100 == 0:
                print(f"Processed {idx}/{len(full_df)} rows...", end='\r')
                
        print(f"Loaded {len(valid_rows)} valid pairs for subset {self.subset}")
        return pd.DataFrame(valid_rows)

    def _find_file(self, uid):
        """Finds the first .jpg file in the directory usually named by UID."""
        # Pattern: data/CBIS-DDSM-JPG/jpeg/{UID}/*.jpg
        search_path = os.path.join(self.jpeg_dir, uid, "*.jpg")
        files = glob.glob(search_path)
        if files:
            return files[0] # Return first match
        return None

    def __len__(self):
        return int(np.floor(len(self.data_df) / self.batch_size))

    def __getitem__(self, index):
        indices = self.indices[index * self.batch_size:(index + 1) * self.batch_size]
        batch_rows = self.data_df.iloc[indices]
        
        X = np.empty((self.batch_size, *self.img_size, 1), dtype=np.float32)
        y = np.empty((self.batch_size, *self.img_size, 1), dtype=np.float32)
        
        for i, (_, row) in enumerate(batch_rows.iterrows()):
            img = self._load_image(row['image_path'])
            mask = self._load_image(row['mask_path'], is_mask=True)
            
            X[i,] = img
            y[i,] = mask
            
        return X, y

    def _load_image(self, path, is_mask=False):
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            # Handle error gracefully - return zeros
            return np.zeros((*self.img_size, 1), dtype=np.float32)
            
        img = cv2.resize(img, self.img_size)
        img = img.astype(np.float32) / 255.0
        
        if is_mask:
            # Binarize mask
            img = np.where(img > 0.5, 1.0, 0.0)
            
        img = np.expand_dims(img, axis=-1)
        return img
    
    def on_epoch_end(self):
        if self.shuffle:
            np.random.shuffle(self.indices)
