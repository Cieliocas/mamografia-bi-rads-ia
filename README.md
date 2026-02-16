# Mammography BI-RADS AI Assistant

This project implements an AI-powered assistant for radiologists to identify and classify findings in mammography exams using Deep Learning (U-Net) and a web-based interface.

## Project Structure

- `src/model/`: Contains the U-Net model architecture, training pipeline, and inference logic.
- `src/web_app/`: Contains the Flask backend and HTML/JS frontend.
- `data/`: Directory for dataset (train/images, train/masks).

## Setup

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Data Preparation**:
   - Place your training images in `data/train/images/`.
   - Place corresponding masks in `data/train/masks/`.

## Usage

### 1. Training the Model
To train the U-Net model on your data:
```bash
python src/model/train.py
```
This will save the trained model as `unet_mammo.h5`.

### 2. Running the Web App
To start the radiologist interface:
```bash
python src/web_app/app.py
```
Open your browser and navigate to `http://127.0.0.1:5000`.

### 3. Using the Interface
- **Open Exam**: Upload a mammography image (PNG/JPG/DICOM converted).
- **AI Analysis**: The model will automatically segment findings.
- **Toggle Mask**: Use the "Toggle AI Mask" button to show/hide the segmentation overlay.
- **Validation**: Select the BI-RADS classification and click "Check / Approve" to save the diagnosis.
