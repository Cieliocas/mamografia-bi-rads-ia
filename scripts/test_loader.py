import sys
import os


# Add src to path
sys.path.append(os.path.abspath('src'))

from model.data_loader import CBISDDSMDataGenerator

def test_loader():
    csv_dir = 'data/CBIS-DDSM-JPG/csv'
    jpeg_dir = 'data/CBIS-DDSM-JPG/jpeg'
    
    print("Initializing generator...")
    gen = CBISDDSMDataGenerator(csv_dir, jpeg_dir, batch_size=4, subset='train')
    
    print(f"Generator length: {len(gen)}")
    
    if len(gen) == 0:
        print("Generator is empty! Check paths.")
        return

    print("Fetching first batch...")
    X, y = gen[0]
    
    print(f"X shape: {X.shape}")
    print(f"y shape: {y.shape}")
    
    assert X.shape == (4, 256, 256, 1)
    assert y.shape == (4, 256, 256, 1)
    
    print("Test passed!")

if __name__ == "__main__":
    test_loader()
